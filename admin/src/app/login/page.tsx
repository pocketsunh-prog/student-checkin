import type { Metadata } from 'next';
import { LoginView } from './login-view';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to the SchoolCheck admin console.',
};

export default function LoginPage() {
  return <LoginView />;
}
