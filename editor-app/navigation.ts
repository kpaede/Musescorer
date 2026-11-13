import { parameters } from './bridge-runtime';
const params = parameters();
export function useSearchParams(): URLSearchParams { return params; }
