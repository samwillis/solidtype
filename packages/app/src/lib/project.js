import * as Y from 'yjs';
export function createProject() {
    const doc = new Y.Doc();
    const files = doc.getMap('files');
    return { doc, files };
}
export function initializeProject(project) {
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
//# sourceMappingURL=project.js.map