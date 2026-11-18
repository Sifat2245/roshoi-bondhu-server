import type { GraphQLContext } from '../../../graphql/graphql.types.js';
import { SearchService, type PostSearchFilters } from '../search.service.js';

export const searchResolvers = {
  Query: {
    recentSearches: async (
      _parent: unknown,
      args: { limit?: number },
      context: GraphQLContext
    ) => {
      const currentUserId = context.currentUser?.id;
      if (!currentUserId) return [];
      return await SearchService.getRecentSearches(currentUserId, args.limit || 8);
    },

    searchSuggestions: async (
      _parent: unknown,
      args: { query: string },
      context: GraphQLContext
    ) => {
      const currentUserId = context.currentUser?.id;
      return await SearchService.getSearchSuggestions(args.query, currentUserId);
    },

    searchAll: async (
      _parent: unknown,
      args: { query: string; postFilters?: PostSearchFilters },
      context: GraphQLContext
    ) => {
      const currentUserId = context.currentUser?.id;
      return await SearchService.searchAll(args.query, args.postFilters || {}, currentUserId);
    },
  },

  Mutation: {
    saveRecentSearch: async (
      _parent: unknown,
      args: { query: string; targetType: 'KEYWORD' | 'USER' | 'GROUP'; targetId?: string },
      context: GraphQLContext
    ) => {
      const currentUserId = context.currentUser?.id;
      if (!currentUserId) {
        throw new Error('Authentication required.');
      }
      return await SearchService.saveRecentSearch(
        currentUserId,
        args.query,
        args.targetType,
        args.targetId
      );
    },

    removeRecentSearch: async (
      _parent: unknown,
      args: { id: string },
      context: GraphQLContext
    ) => {
      const currentUserId = context.currentUser?.id;
      if (!currentUserId) {
        throw new Error('Authentication required.');
      }
      return await SearchService.removeRecentSearch(currentUserId, args.id);
    },

    clearRecentSearches: async (
      _parent: unknown,
      _args: unknown,
      context: GraphQLContext
    ) => {
      const currentUserId = context.currentUser?.id;
      if (!currentUserId) {
        throw new Error('Authentication required.');
      }
      return await SearchService.clearRecentSearches(currentUserId);
    },
  },
};

export default searchResolvers;

