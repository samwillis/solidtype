import * as Y from 'yjs';

export interface Project {
  doc: Y.Doc;
  files: Y.Map<Y.Text>;
}

export function createProject(): Project {
  const doc = new Y.Doc();
  const files = doc.getMap<Y.Text>('files');
  return { doc, files };
}

export function initializeProject(project: Project): void {
  // Initialize with a default Part.tsx file
  const partFile = new Y.Text();
  const sampleCode = `export type PartProps = {
  width?: number;
  height?: number;
  depth?: number;
};

export function Part(props: PartProps = {}) {
  const width = props.width ?? 10;
  const height = props.height ?? 10;
  const depth = props.depth ?? 10;

  return (
    <Model>
      {/* TODO: Add sketch and extrude operations */}
    </Model>
  );
}
`;
  partFile.insert(0, sampleCode);
  project.files.set('Part.tsx', partFile);
}
