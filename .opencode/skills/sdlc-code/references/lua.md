# Lua

- Follow the host runtime and Lua version first; embedded environments may restrict libraries, syntax, allocation, or error behavior.
- Keep variables and functions local unless a global is part of the host contract.
- Return `nil, error` for expected failures when that matches the surrounding API. Use `pcall` or `xpcall` at boundaries that can recover from unexpected failures.
- Use tables and metatables directly when they simplify the domain; do not impose object-oriented patterns on procedural or functional code.
- Use configured tools such as StyLua, Luacheck, or Busted only when compatible with the host and repository.
