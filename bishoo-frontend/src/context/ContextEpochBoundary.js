import React from 'react';

// Changing the server context epoch replaces the entire operational subtree,
// discarding page-local dashboards, drafts, selections, filters and pagination.
const ContextEpochBoundary = ({ contextEpoch, children }) => (
  <React.Fragment key={`context-${contextEpoch}`}>{children}</React.Fragment>
);

export default ContextEpochBoundary;
