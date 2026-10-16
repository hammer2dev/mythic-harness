package com.zcode.java;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.OperationCanceledException;
import org.eclipse.jdt.core.IBuffer;
import org.eclipse.jdt.core.IBufferChangedListener;
import org.eclipse.jdt.core.ICompilationUnit;
import org.eclipse.jdt.core.IProblemRequestor;
import org.eclipse.jdt.core.WorkingCopyOwner;
import org.eclipse.jdt.core.compiler.IProblem;
import org.eclipse.jdt.ls.core.internal.IDelegateCommandHandler;
import org.eclipse.jdt.ls.core.internal.JDTUtils;
import org.eclipse.jdt.ls.core.internal.handlers.BaseDiagnosticsHandler;
import org.eclipse.lsp4j.Diagnostic;
import org.eclipse.lsp4j.jsonrpc.ResponseErrorException;
import org.eclipse.lsp4j.jsonrpc.messages.ResponseError;

/** 与固定的 JDT LS 1.62.0 一起构建；不对外暴露其内部 API。 */
public final class DiagnosticsSnapshotHandler implements IDelegateCommandHandler {
    private static final String COMMAND = "zcode.java.diagnosticsSnapshot";

    @Override
    public Object executeCommand(String commandId, List<Object> arguments, IProgressMonitor monitor)
            throws Exception {
        if (!COMMAND.equals(commandId) || arguments.size() != 1
                || !(arguments.getFirst() instanceof Map<?, ?> input)
                || !(input.get("uri") instanceof String uri)
                || !(input.get("expectedContentHash") instanceof String expectedHash)) {
            throw new ResponseErrorException(new ResponseError(-32602,
                    "Expected one argument containing uri and expectedContentHash", null));
        }
        try {
            return snapshot(uri, expectedHash, monitor);
        } catch (OperationCanceledException cancelled) {
            throw new ResponseErrorException(new ResponseError(-32800, "Diagnostics request cancelled", null));
        }
    }

    private SnapshotResult snapshot(String uri, String expectedHash, IProgressMonitor monitor) throws Exception {
        checkCancelled(monitor);
        ICompilationUnit primary = JDTUtils.resolveCompilationUnit(uri);
        if (primary == null || !primary.isWorkingCopy()) {
            return unavailable(uri, "Document is not open in the language server");
        }
        IBuffer sourceBuffer = primary.getBuffer();
        if (sourceBuffer == null || sourceBuffer.isClosed()) {
            return unavailable(uri, "Document buffer is unavailable");
        }

        AtomicBoolean changed = new AtomicBoolean();
        IBufferChangedListener listener = event -> changed.set(true);
        sourceBuffer.addBufferChangedListener(listener);
        WorkingCopyOwner owner = null;
        try {
            String content = sourceBuffer.getContents();
            if (content == null) {
                return unavailable(uri, "Document buffer is closed");
            }
            String beforeHash = hash(content);
            if (!beforeHash.equals(expectedHash)) {
                return new SnapshotResult(uri, "stale", null, beforeHash, beforeHash,
                        changed.get(), List.of(), "Language server content does not match requested content");
            }

            ProblemCollector collector = new ProblemCollector();
            owner = new WorkingCopyOwner() {
                @Override
                public IBuffer createBuffer(ICompilationUnit workingCopy) {
                    IBuffer buffer = super.createBuffer(workingCopy);
                    // 固定实际读取的服务端内容；不能借用会修改 primary 文档的 DocumentAdapter。
                    buffer.setContents(content);
                    return buffer;
                }

                @Override
                public IProblemRequestor getProblemRequestor(ICompilationUnit workingCopy) {
                    return collector;
                }
            };
            // non-primary 上的 getWorkingCopy 会返回自身，必须从 primary 创建请求独占副本。
            ICompilationUnit copy = primary.getPrimary().getWorkingCopy(owner, monitor);
            copy.setOptions(primary.getCustomOptions());
            collector.reset();
            checkCancelled(monitor);
            copy.reconcile(ICompilationUnit.NO_AST,
                    ICompilationUnit.FORCE_PROBLEM_DETECTION
                            | ICompilationUnit.ENABLE_BINDINGS_RECOVERY
                            | ICompilationUnit.ENABLE_STATEMENTS_RECOVERY,
                    owner, monitor);
            checkCancelled(monitor);
            if (!collector.completed) {
                return unavailable(uri, "Compiler did not complete diagnostic reporting");
            }
            List<Diagnostic> diagnostics = BaseDiagnosticsHandler.toDiagnosticsArray(copy, collector.problems, true);
            String analyzedHash = hash(copy.getBuffer().getContents());
            String afterContent = sourceBuffer.isClosed() ? null : sourceBuffer.getContents();
            String afterHash = afterContent == null ? null : hash(afterContent);
            boolean changedDuringAnalysis = changed.get() || !beforeHash.equals(afterHash)
                    || !beforeHash.equals(analyzedHash);
            return new SnapshotResult(uri, changedDuringAnalysis ? "stale" : "current", analyzedHash,
                    beforeHash, afterHash, changedDuringAnalysis, diagnostics,
                    changedDuringAnalysis ? "Document changed while diagnostics were computed" : null);
        } finally {
            sourceBuffer.removeBufferChangedListener(listener);
            if (owner != null) {
                // JDT 在创建 buffer 前登记 working copy；创建途中取消也必须释放已登记的副本。
                ICompilationUnit ownedCopy = primary.getPrimary().findWorkingCopy(owner);
                if (ownedCopy != null) {
                    ownedCopy.discardWorkingCopy();
                }
            }
        }
    }

    private static void checkCancelled(IProgressMonitor monitor) {
        if (monitor.isCanceled()) {
            throw new OperationCanceledException();
        }
    }

    private static String hash(String content) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(content.getBytes(StandardCharsets.UTF_8)));
    }

    private static SnapshotResult unavailable(String uri, String reason) {
        return new SnapshotResult(uri, "unavailable", null, null, null, false, List.of(), reason);
    }

    public record SnapshotResult(String uri, String status, String analyzedContentHash,
            String beforeContentHash, String afterContentHash, boolean changedDuringAnalysis,
            List<Diagnostic> diagnostics, String reason) {}

    private static final class ProblemCollector implements IProblemRequestor {
        private final List<IProblem> problems = new ArrayList<>();
        private boolean completed;

        private void reset() {
            problems.clear();
            completed = false;
        }

        @Override
        public void beginReporting() {
            reset();
        }

        @Override
        public void acceptProblem(IProblem problem) {
            problems.add(problem);
        }

        @Override
        public void endReporting() {
            completed = true;
        }

        @Override
        public boolean isActive() {
            return true;
        }
    }
}
