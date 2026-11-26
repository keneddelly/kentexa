import React from 'react';
import { buildInlineTextSegments } from '../utils/inlineReferences';

const LINK_STYLE = {
  color: '#2563EB',
  textDecoration: 'none',
  fontWeight: 600,
  cursor: 'pointer',
};

const InlineEntityText = ({ text, references = [], onReferenceClick, onHashtagClick, style, className, testId }) => {
  const segments = buildInlineTextSegments(text, references);
  if (!segments.length) return null;
  return (
    <span className={className} data-testid={testId} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', ...style }}>
      {segments.map((segment, index) => {
        if (segment.kind === 'reference') {\n          if (!onReferenceClick) return <React.Fragment key={\`ref-text-\${index}\`}>{segment.text}</React.Fragment>;
          return (
            <button key={`ref-${index}`} type="button" onClick={(event) => { event.stopPropagation(); onReferenceClick?.(segment); }}
              aria-label={segment.entityType === 'business' ? `Biashara: ${segment.matchedText}` : segment.matchedText}
              style={{ ...LINK_STYLE, border: 0, background: 'none', padding: 0, font: 'inherit', verticalAlign: 'baseline' }}>
              {segment.text}
            </button>
          );
        }
        if (segment.kind === 'hashtag') {\n          if (!onHashtagClick) return <React.Fragment key={\`tag-text-\${index}\`}>{segment.text}</React.Fragment>;
          return (
            <button key={`tag-${index}`} type="button" onClick={(event) => { event.stopPropagation(); onHashtagClick?.(segment.hashtag); }}
              aria-label={`Hashtag ${segment.hashtag}`}
              style={{ ...LINK_STYLE, border: 0, background: 'none', padding: 0, font: 'inherit', verticalAlign: 'baseline' }}>
              {segment.text}
            </button>
          );
        }
        return <React.Fragment key={`text-${index}`}>{segment.text}</React.Fragment>;
      })}
    </span>
  );
};

export default InlineEntityText;
