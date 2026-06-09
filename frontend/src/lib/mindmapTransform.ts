import type { MindMapData, MindMapNode } from "@/types";

const MAX_NODES = 80;
const MAX_DEPTH = 4;

/**
 * 清洗 Mermaid 源码：去掉围栏、多余空白
 */
export function cleanMermaidSource(source: string): string {
  return source
    .replace(/^`mermaid\s*/i, "")
    .replace(/^`\s*/i, "")
    .replace(/\s*`\s*$/, "")
    .trim();
}

/**
 * 解析 Mermaid mindmap 为 MindMapData
 * 支持 root((text)) / root(text) / 普通节点
 * 仅支持 mindmap 类型
 */
export function parseMermaidMindmap(source: string): MindMapData {
  const cleaned = cleanMermaidSource(source);
  const lines = cleaned.split("\n").filter(l => l.trim());

  if (lines.length === 0 || !lines[0].trim().startsWith("mindmap")) {
    throw new Error("不是有效的 mindmap 格式");
  }

  let idCounter = 0;
  const newId = () => "node-" + (++idCounter);

  // 解析 root 行
  const rootIdx = lines.findIndex(l => l.trim().startsWith("root"));
  if (rootIdx < 0) throw new Error("缺少 root 节点");

  const rootText = lines[rootIdx].trim()
    .replace(/^root\(\(/, "").replace(/\)\)$/, "")
    .replace(/^root\(/, "").replace(/\)$/, "")
    .trim();

  const root: MindMapNode = { id: newId(), text: rootText || "中心主题", children: [] };

  // 基于缩进层级构建树
  const stack: { node: MindMapNode; indent: number; depth: number }[] = [{ node: root, indent: -1, depth: 0 }];

  for (let i = rootIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const indent = line.search(/\S/);
    if (indent < 0) continue;

    const text = line.trim()
      .replace(/^\(\(/, "").replace(/\)\)$/, "")
      .replace(/^\(/, "").replace(/\)$/, "")
      .replace(/^[[]/, "").replace(/]$/, "")
      .replace(/^{{/, "").replace(/}}$/, "")
      .trim();
    if (!text) continue;

    // 找到父节点
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    const depth = parent.depth + 1;

    // 层级限制
    if (depth > MAX_DEPTH) continue;

    // 节点数限制
    if (idCounter >= MAX_NODES) break;

    const node: MindMapNode = { id: newId(), text, children: [] };
    parent.node.children.push(node);
    stack.push({ node, indent, depth });
  }

  return { root };
}

/**
 * 规范化 MindMapData：去空文本、截断过深层级
 */
export function normalizeMindMapData(data: MindMapData): MindMapData {
  function normalize(node: MindMapNode, depth: number): MindMapNode | null {
    if (!node.text?.trim()) return null;
    if (depth > MAX_DEPTH) return null;
    const children = (node.children || [])
      .map(c => normalize(c, depth + 1))
      .filter(Boolean) as MindMapNode[];
    return { ...node, children, text: node.text.trim().slice(0, 200) };
  }

  const root = normalize(data.root, 0);
  if (!root) throw new Error("思维导图数据无效");
  return { root };
}

/**
 * 确保所有节点有唯一 id
 */
export function assignMindMapNodeIds(data: MindMapData): MindMapData {
  let counter = 0;
  function assign(node: MindMapNode): MindMapNode {
    return {
      ...node,
      id: node.id || "node-" + (++counter),
      children: (node.children || []).map(assign),
    };
  }
  return { root: assign(data.root) };
}