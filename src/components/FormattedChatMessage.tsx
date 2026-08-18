import React from 'react';

interface Props {
  content: string;
  isUser?: boolean;
}

export default function FormattedChatMessage({ content, isUser = false }: Props) {
  if (!content) return null;

  // Function to render inline bold, code, and links
  const renderInline = (text: string) => {
    // Match **bold**, *italic*, `code`
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);

    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        const inner = part.slice(2, -2);
        return (
          <strong key={i} className={isUser ? 'font-bold underlineDecoration' : 'font-bold text-foreground'}>
            {inner}
          </strong>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        const inner = part.slice(1, -1);
        return (
          <code
            key={i}
            className={`px-1.5 py-0.5 rounded text-2xs font-mono ${
              isUser ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-primary'
            }`}
          >
            {inner}
          </code>
        );
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        const inner = part.slice(1, -1);
        return <em key={i}>{inner}</em>;
      }
      return part;
    });
  };

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  let inList = false;
  let listItems: React.ReactNode[] = [];

  const flushList = () => {
    if (inList && listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="my-1.5 space-y-1 pl-4 list-disc">
          {listItems}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      elements.push(<div key={`empty-${index}`} className="h-1.5" />);
      return;
    }

    // Horizontal Rule
    if (trimmed === '---' || trimmed === '***') {
      flushList();
      elements.push(
        <hr
          key={`hr-${index}`}
          className={`my-3 ${isUser ? 'border-primary-foreground/30' : 'border-border/60'}`}
        />
      );
      return;
    }

    // Headers: ### Header, ## Header, # Header
    if (trimmed.startsWith('#')) {
      flushList();
      const headerText = trimmed.replace(/^#+\s*/, '');
      elements.push(
        <h4
          key={`header-${index}`}
          className={`font-bold text-sm mt-3 mb-1 tracking-tight flex items-center gap-1.5 ${
            isUser ? 'text-primary-foreground' : 'text-foreground'
          }`}
        >
          {renderInline(headerText)}
        </h4>
      );
      return;
    }

    // Bullet List Items: * item, - item, • item
    const bulletMatch = trimmed.match(/^(\*|-|•)\s+(.*)/);
    if (bulletMatch) {
      inList = true;
      listItems.push(
        <li key={`li-${index}`} className="leading-relaxed">
          {renderInline(bulletMatch[2])}
        </li>
      );
      return;
    }

    // Numbered List Items: 1. item, 2. item
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      flushList();
      elements.push(
        <div key={`num-${index}`} className="flex items-start gap-2 my-1 leading-relaxed">
          <span
            className={`font-semibold shrink-0 text-xs px-1.5 py-0.5 rounded ${
              isUser ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary/10 text-primary'
            }`}
          >
            {numMatch[1]}
          </span>
          <div className="flex-1">{renderInline(numMatch[2])}</div>
        </div>
      );
      return;
    }

    // Regular Paragraph
    flushList();
    elements.push(
      <p key={`p-${index}`} className="leading-relaxed">
        {renderInline(trimmed)}
      </p>
    );
  });

  flushList();

  return <div className="space-y-1 text-sm font-sans">{elements}</div>;
}
