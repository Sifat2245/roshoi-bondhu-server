import { createYoga } from 'graphql-yoga';
import { schema } from './schema.js';
import { createContext } from './context.js';
import { env } from '../config/env.js';
import { depthLimit } from './validation/depth-limit.js';

export const yoga = createYoga({
  schema,
  context: createContext,
  graphqlEndpoint: '/graphql',
  graphiql: env.NODE_ENV !== 'production',
  maskedErrors: env.NODE_ENV === 'production',
  landingPage: false,
  plugins: [
    {
      onValidate({ addValidationRule }: any) {
        addValidationRule(depthLimit(8));
      },
    },
  ],
});

export default yoga;

