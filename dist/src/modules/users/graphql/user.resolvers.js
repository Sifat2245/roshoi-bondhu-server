export const userResolvers = {
    Query: {
        me: (_parent, _args, context) => {
            return context.currentUser;
        },
    },
};
export default userResolvers;
