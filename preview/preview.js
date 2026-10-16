import {formatted} from '../extension/render.js';
const text=await (await fetch('../fixtures/markdown-math.md')).text();
document.getElementById('narrow').append(formatted(text));
document.getElementById('wide').append(formatted(text));
