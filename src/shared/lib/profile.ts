export const HANDLE_PATTERN = '[A-Za-z0-9_\\u3041-\\u30FF\\u4E00-\\u9FFF\\uAC00-\\uD7A3]{2,16}';
export const HANDLE_RE = new RegExp(`^${HANDLE_PATTERN}$`, 'u');
