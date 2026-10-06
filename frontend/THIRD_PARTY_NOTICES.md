# Third-party notices

Source components copied from official registries on 2026-10-03, then adapted locally. No registry CLI, MCP or remote scripts are executed by this app.

- 8bitcn: https://www.8bitcn.com/r/{button,card,input,checkbox}.json
- shadcn/ui: https://ui.shadcn.com/r/styles/new-york-v4/{button,card,input,checkbox}.json
- Press Start 2P: original unmodified font from https://github.com/google/fonts/tree/main/ofl/pressstart2p; bundled locally, license in public/fonts/OFL.txt.

Adaptations: use the existing local cn helper instead of an additional cn package; local font instead of Google Fonts; shared Radix checkbox types; do not forward styling-only props to DOM; thinner pixel borders for cards/fields/checkboxes and button decorations, preserving their stepped geometry and accessible target sizes; card custom classes apply to the outer frame only to avoid duplicated margins. Components remain editable source, not a runtime registry dependency.

## 8bitcn

MIT License

Copyright (c) 2025 8bitcn

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


## shadcn/ui

MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
