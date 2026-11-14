import { type ValidationContext, type ASTVisitor, GraphQLError, Kind } from 'graphql';

/**
 * GraphQL AST Validation Rule to limit query depth and prevent DoS attacks
 */
export const depthLimit = (maxDepth: number = 8) => {
  return (context: ValidationContext): ASTVisitor => {
    return {
      OperationDefinition(node) {
        const depth = getDepth(node, 0);
        if (depth > maxDepth) {
          context.reportError(
            new GraphQLError(
              `Operation "${node.name?.value || 'anonymous'}" has a query depth of ${depth}, which exceeds the maximum allowed depth of ${maxDepth}.`,
              { nodes: [node] }
            )
          );
        }
      },
    };
  };
};

function getDepth(node: any, currentDepth = 0): number {
  if (!node || !node.selectionSet || !node.selectionSet.selections) {
    return currentDepth;
  }
  let maxChildDepth = currentDepth;
  for (const selection of node.selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      if (selection.selectionSet) {
        const d = getDepth(selection, currentDepth + 1);
        if (d > maxChildDepth) maxChildDepth = d;
      }
    } else if (selection.kind === Kind.INLINE_FRAGMENT || selection.kind === Kind.FRAGMENT_SPREAD) {
      const d = getDepth(selection, currentDepth);
      if (d > maxChildDepth) maxChildDepth = d;
    }
  }
  return maxChildDepth;
}

export default depthLimit;

