import { useState, useEffect } from 'react';
import * as Y from 'yjs';
import { useProject } from './useProject';

export function useYFile(filename: string): Y.Text | null {
  const project = useProject();
  const [yText, setYText] = useState<Y.Text | null>(null);

  useEffect(() => {
    const files = project.files;
    const text = files.get(filename) || null;
    setYText(text);

    const observer = () => {
      const updatedText = files.get(filename) || null;
      setYText(updatedText);
    };

    files.observe(observer);

    return () => {
      files.unobserve(observer);
    };
  }, [project, filename]);

  return yText;
}
