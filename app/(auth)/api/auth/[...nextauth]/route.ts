// NextAuth v5 catchall — re-exports the handlers from /auth.ts at the repo root.
import { handlers } from '../../../../../auth';

export const { GET, POST } = handlers;
