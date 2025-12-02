import { useState, useEffect } from 'react';
import { useProject } from './useProject';
export function useYFile(filename) {
    const project = useProject();
    const [yText, setYText] = useState(null);
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
//# sourceMappingURL=useYFile.js.map