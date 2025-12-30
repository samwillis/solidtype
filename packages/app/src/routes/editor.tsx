import { createFileRoute } from '@tanstack/react-router';
import { Editor } from '~/editor/Editor';

export const Route = createFileRoute('/editor')({
  ssr: false, // Client-only: uses WebGL, WASM, and browser APIs
  component: EditorRoute,
});

function EditorRoute() {
  return <Editor />;
}
