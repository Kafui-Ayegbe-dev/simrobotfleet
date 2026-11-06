// Pretty-printed JSON with a trailing newline, so curl output is readable
// in the terminal (and zsh stops appending a "%").
export function prettyJson(_req, res, next) {
  res.json = (body) => res.type("json").send(JSON.stringify(body, null, 2) + "\n");
  next();
}
