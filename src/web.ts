import { Parser } from "./parser/parser";
import { renderPrompt } from "./renderPrompt";
import { enableCollapsibleBlocks } from "./ui";

export function renderFromFileUpload(file: File): void {
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target?.result as string;
        const parser = new Parser(text);
        try {
            const ast = parser.parsePrompt();
            document.getElementById("output")!.innerHTML = renderPrompt(ast);
            enableCollapsibleBlocks();
        } catch (err: any) {
            console.error("Syntax Error:", err.message);
        }
    };
    reader.readAsText(file);
}