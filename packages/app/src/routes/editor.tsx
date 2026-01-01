import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Editor } from "~/editor/Editor";

// Search params schema for optional documentId
const editorSearchSchema = z.object({
  documentId: z.string().optional(),
});

export const Route = createFileRoute("/editor")({
  ssr: false, // Client-only: uses WebGL, WASM, and browser APIs
  validateSearch: editorSearchSchema,
  component: EditorRoute,
});

function EditorRoute() {
  const { documentId } = Route.useSearch();
  return <Editor documentId={documentId} />;
}
