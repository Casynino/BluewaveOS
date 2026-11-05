/* Sign-in for tests: an action that ends by signing the customer in reaches
   here instead of NextAuth, and the call is remembered so a test can see it. */
const calls = [];
module.exports = {
  calls,
  signIn: async (...args) => {
    calls.push(args);
  },
  signOut: async () => undefined,
  auth: async () => null,
};
