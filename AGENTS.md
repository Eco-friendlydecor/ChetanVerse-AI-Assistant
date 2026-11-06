# Chetanverse AI Assistant

This project is a local-first productivity dashboard. The React UI and the MCP server use the same Node service layer and SQLite database.

## Assistant workflow

- Use the `create_task` MCP tool for tasks submitted in chat. Infer a concise title, category (`Work`, `Study`, `Personal`, `Health`, or `Other`), and priority (`Urgent`, `High`, `Medium`, or `Low`) from the user's words. Ask one brief follow-up only when a missing detail materially affects the task.
- Use `list_tasks`, `update_task`, `list_projects`, and `create_project` to act on real saved data. Never claim a change happened unless the tool confirms it.
- Track execution by moving task status among `Todo`, `In progress`, `Blocked`, and `Done`. Project completion percentage is calculated from its tasks.
- Use `get_daily_summary` for summaries. Report saved task counts, due/overdue work, completed work, blockers, and project progress; do not invent activity.
- Keep personal data and the SQLite database local. Never add API keys or credentials to this repository.

## Development

- `npm run dev` starts the API and Vite dashboard.
- `npm test` runs the Node test suite.
- `npm run build` creates the production frontend bundle.
- `npm run mcp` starts the stdio MCP server. MCP protocol messages must be the only content written to stdout; diagnostics belong on stderr.
