import { SearchService } from '../search.service.js';
export const searchResolvers = {
    Query: {
        recentSearches: async (_parent, args, context) => {
            const currentUserId = context.currentUser?.id;
            if (!currentUserId)
                return [];
            return await SearchService.getRecentSearches(currentUserId, args.limit || 8);
        },
        searchSuggestions: async (_parent, args, context) => {
            const currentUserId = context.currentUser?.id;
            return await SearchService.getSearchSuggestions(args.query, currentUserId);
        },
        searchAll: async (_parent, args, context) => {
            const currentUserId = context.currentUser?.id;
            return await SearchService.searchAll(args.query, args.postFilters || {}, currentUserId);
        },
    },
    Mutation: {
        saveRecentSearch: async (_parent, args, context) => {
            const currentUserId = context.currentUser?.id;
            if (!currentUserId) {
                throw new Error('Authentication required.');
            }
            return await SearchService.saveRecentSearch(currentUserId, args.query, args.targetType, args.targetId);
        },
        removeRecentSearch: async (_parent, args, context) => {
            const currentUserId = context.currentUser?.id;
            if (!currentUserId) {
                throw new Error('Authentication required.');
            }
            return await SearchService.removeRecentSearch(currentUserId, args.id);
        },
        clearRecentSearches: async (_parent, _args, context) => {
            const currentUserId = context.currentUser?.id;
            if (!currentUserId) {
                throw new Error('Authentication required.');
            }
            return await SearchService.clearRecentSearches(currentUserId);
        },
    },
};
export default searchResolvers;
