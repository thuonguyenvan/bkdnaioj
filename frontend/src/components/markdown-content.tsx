import React, { useMemo } from 'react';
import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });

interface Props {
  content: string;
  style?: React.CSSProperties;
  className?: string;
}

export const MarkdownContent: React.FC<Props> = ({ content, style, className }) => {
  const html = useMemo(() => marked.parse(content) as string, [content]);

  return (
    <div
      className={`markdown-body ${className ?? ''}`}
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
