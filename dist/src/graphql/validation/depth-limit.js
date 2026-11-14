import { GraphQLError, Kind } from 'graphql';
/**
 * GraphQL AST Validation Rule to limit query depth and prevent DoS attacks
 */
export const depthLimit = (maxDepth = 8) => {
    return (context) => {
        return {
            OperationDefinition(node) {
                const depth = getDepth(node, 0);
                if (depth > maxDepth) {
                    context.reportError(new GraphQLError(`Operation "${node.name?.value || 'anonymous'}" has a query depth of ${depth}, which exceeds the maximum allowed depth of ${maxDepth}.`, { nodes: [node] }));
                }
            },
        };
    };
};
function getDepth(node, currentDepth = 0) {
    if (!node || !node.selectionSet || !node.selectionSet.selections) {
        return currentDepth;
    }
    let maxChildDepth = currentDepth;
    for (const selection of node.selectionSet.selections) {
        if (selection.kind === Kind.FIELD) {
            if (selection.selectionSet) {
                const d = getDepth(selection, currentDepth + 1);
                if (d > maxChildDepth)
                    maxChildDepth = d;
            }
        }
        else if (selection.kind === Kind.INLINE_FRAGMENT || selection.kind === Kind.FRAGMENT_SPREAD) {
            const d = getDepth(selection, currentDepth);
            if (d > maxChildDepth)
                maxChildDepth = d;
        }
    }
    return maxChildDepth;
}
export default depthLimit;
