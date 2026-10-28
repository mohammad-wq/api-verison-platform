export function baseUrlError(value) {
  if (typeof value !== "string" || !value.trim()) return "Enter a base URL for this environment.";
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) return "The base URL must use HTTP or HTTPS.";
    if (!url.hostname || url.username || url.password) return "Enter a valid base URL without embedded credentials.";
    if (url.search || url.hash) return "The base URL cannot include a query string or fragment.";
    return null;
  } catch {
    return "Enter a valid absolute URL, such as https://api.example.com.";
  }
}
