import { api, ApiError, type AuthUser } from '@api/client.ts';
import { getAuthToken, setAuthToken } from '@utils/storage.ts';
import { initCart } from '@features/cart/state.ts';
import { syncWishlistToServer } from '@features/user/Wishlist.ts';
import { showToast } from '@components/ui/Toast.ts';

/**
 * Signed-in state.
 *
 * The token lives in localStorage; on boot we re-validate it with
 * `GET /api/auth/me` so an expired or revoked token is cleared rather than
 * causing 401s all over the page.
 */
const USER_KEY = 'auth_user';

let user: AuthUser | null = readStoredUser();
let ready = false;
let listeners: Array<(user: AuthUser | null) => void> = [];

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function notify(): void {
  const snapshot = user;
  listeners.forEach((fn) => fn(snapshot));
}

function setUser(next: AuthUser | null): void {
  user = next;
  try {
    if (next) localStorage.setItem(USER_KEY, JSON.stringify(next));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* storage unavailable — keep the in-memory state only */
  }
  notify();
}

export function getUser(): AuthUser | null {
  return user;
}

export function isSignedIn(): boolean {
  return Boolean(user);
}

export function isAdmin(): boolean {
  return user?.role === 'admin';
}

/** True once `initSession()` has settled — the header renders immediately either way. */
export function isSessionReady(): boolean {
  return ready;
}

export function subscribeSession(fn: (user: AuthUser | null) => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

export async function initSession(): Promise<AuthUser | null> {
  if (!getAuthToken()) {
    setUser(null);
    ready = true;
    return null;
  }

  try {
    const { user: fresh } = await api.auth.me();
    setUser(fresh);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 404)) {
      // Stale token — drop it so the UI shows the signed-out state.
      setAuthToken(null);
      setUser(null);
    } else {
      console.warn('Could not verify the session; keeping the cached user:', error);
    }
  } finally {
    ready = true;
  }

  return user;
}

async function afterAuth(token: string, nextUser: AuthUser, cartMerged: number): Promise<void> {
  setAuthToken(token);
  setUser(nextUser);

  // The server just adopted this browser's guest cart and we may have a local
  // wishlist to push up — refresh both so the UI matches the account.
  await Promise.all([initCart(), syncWishlistToServer()]);

  if (cartMerged > 0) {
    showToast(`Welcome back — ${cartMerged} item${cartMerged === 1 ? '' : 's'} from your cart ${cartMerged === 1 ? 'was' : 'were'} saved to your account.`);
  }
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const { token, user: nextUser, cartMerged } = await api.auth.login({ email, password });
  await afterAuth(token, nextUser, cartMerged);
  return nextUser;
}

export async function register(input: {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}): Promise<AuthUser> {
  const { token, user: nextUser, cartMerged } = await api.auth.register(input);
  await afterAuth(token, nextUser, cartMerged);
  return nextUser;
}

/**
 * Creates (or promotes) an admin account. Used by the admin gate when the
 * server allows it — first run, or with a valid ADMIN_SETUP_KEY.
 */
export async function registerAdmin(input: {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  setupKey?: string;
}): Promise<AuthUser> {
  const { token, user: nextUser, cartMerged } = await api.auth.registerAdmin(input);
  await afterAuth(token, nextUser, cartMerged);
  return nextUser;
}

export async function updateProfile(input: {
  firstName?: string;
  lastName?: string;
}): Promise<AuthUser> {
  const { user: nextUser } = await api.auth.updateProfile(input);
  setUser(nextUser);
  return nextUser;
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const { token, user: nextUser } = await api.auth.changePassword({ currentPassword, newPassword });
  setAuthToken(token);
  setUser(nextUser);
}

export function logout(): void {
  setAuthToken(null);
  setUser(null);
}
