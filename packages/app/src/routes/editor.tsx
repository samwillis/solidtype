import { createFileRoute } from '@tanstack/react-router';
import { Editor } from '~/editor/Editor';

export const Route = createFileRoute('/editor')({
  component: EditorRoute,
});

function EditorRoute() {
  return <Editor />;
}
