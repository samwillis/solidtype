import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as Tabs from '@radix-ui/react-tabs';
import Viewer from './components/Viewer';
import CodeEditor from './components/CodeEditor';
import FeatureTree from './components/FeatureTree';
import PropertiesPanel from './components/PropertiesPanel';
import './App.css';
const App = () => {
    return (_jsxs("div", { className: "app", children: [_jsx("div", { className: "app-left-panel", children: _jsxs(Tabs.Root, { defaultValue: "feature-tree", className: "tabs-root", children: [_jsxs(Tabs.List, { className: "tabs-list", children: [_jsx(Tabs.Trigger, { value: "feature-tree", className: "tabs-trigger", children: "Feature Tree" }), _jsx(Tabs.Trigger, { value: "files-code", className: "tabs-trigger", children: "Files & Code" })] }), _jsx(Tabs.Content, { value: "feature-tree", className: "tabs-content", children: _jsx(FeatureTree, {}) }), _jsx(Tabs.Content, { value: "files-code", className: "tabs-content", children: _jsx(CodeEditor, {}) })] }) }), _jsx("div", { className: "app-center", children: _jsx(Viewer, {}) }), _jsx("div", { className: "app-right-panel", children: _jsx(PropertiesPanel, {}) })] }));
};
export default App;
//# sourceMappingURL=App.js.map