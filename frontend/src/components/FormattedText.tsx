import React, { useMemo } from "react";

interface Props {
  text: string;
}

function parseNodeToReact(node: Node, key: string | number): React.ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    const tagName = el.tagName.toUpperCase();
    const children = Array.from(el.childNodes).map((child, idx) =>
      parseNodeToReact(child, `${key}-${idx}`)
    );

    if (tagName === "B" || tagName === "STRONG") {
      return <strong key={key}>{children}</strong>;
    }
    if (tagName === "I" || tagName === "EM") {
      return <em key={key}>{children}</em>;
    }
    if (tagName === "FONT" || tagName === "SPAN") {
      const color = el.getAttribute("color") || el.style.color;
      if (color) {
        return (
          <span key={key} style={{ color }} data-color={color}>
            {children}
          </span>
        );
      }
      return <React.Fragment key={key}>{children}</React.Fragment>;
    }
    if (tagName === "BR") {
      return <br key={key} />;
    }
    if (tagName === "P") {
      return <span key={key} className="formatted-p">{children}</span>;
    }

    // Default: discard unsafe tags (script, style, etc.) and only render safe children
    return <React.Fragment key={key}>{children}</React.Fragment>;
  }

  return null;
}

export default function FormattedText({ text }: Props) {
  const content = useMemo(() => {
    if (!text) return null;

    // Fast path: if no HTML tags found, render plain text
    if (!text.includes("<") || !text.includes(">")) {
      return text;
    }

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/html");
      const nodes = Array.from(doc.body.childNodes);
      return nodes.map((node, idx) => parseNodeToReact(node, idx));
    } catch {
      return text;
    }
  }, [text]);

  return <>{content}</>;
}
