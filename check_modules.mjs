// Static module verifier — checks that every referenced identifier is either:
//   - declared in this file (import, top-level, function-local, param)
//   - a browser/runtime global on the allowlist
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import fs from 'fs';
import path from 'path';

const FILES = process.argv.length > 2
  ? process.argv.slice(2)
  : ['config','state','themes','world','canvas','assets','atmosphere','ai','render','save','ui','main'].map(n => `js/${n}.js`);

const BROWSER_GLOBALS = new Set([
  'document','window','localStorage','performance','requestAnimationFrame','setInterval','setTimeout','clearTimeout','clearInterval',
  'Math','Date','Object','Array','JSON','console','Number','String','Boolean','Map','Set','WeakMap','Promise',
  'Float32Array','Uint8Array','Uint16Array','Uint32Array','Int8Array','Int16Array','Int32Array',
  'atob','btoa','isFinite','isNaN','parseInt','parseFloat','confirm','alert','prompt',
  'AudioContext','webkitAudioContext','Image','Audio','HTMLAudioElement','HTMLImageElement','HTMLElement','HTMLCanvasElement',
  'fetch','URL','Blob','FileReader','globalThis','Symbol',
  'Error','TypeError','RangeError','RegExp','structuredClone','Intl',
  'undefined','NaN','Infinity','arguments','navigator','location',
  'Event','MouseEvent','KeyboardEvent','TouchEvent','CustomEvent','PointerEvent','WheelEvent',
  'CanvasRenderingContext2D','OffscreenCanvas','requestIdleCallback','cancelAnimationFrame',
  'Proxy','Reflect','Function','BigInt',
]);

function collectPatternIds(node, out) {
  if (!node) return;
  switch (node.type) {
    case 'Identifier': out.add(node.name); break;
    case 'ObjectPattern':
      for (const p of node.properties) {
        if (p.type === 'Property') collectPatternIds(p.value, out);
        else if (p.type === 'RestElement') collectPatternIds(p.argument, out);
      }
      break;
    case 'ArrayPattern':
      for (const e of node.elements) if (e) collectPatternIds(e, out);
      break;
    case 'RestElement': collectPatternIds(node.argument, out); break;
    case 'AssignmentPattern': collectPatternIds(node.left, out); break;
  }
}

let totalUnresolved = 0;
for (const file of FILES) {
  const src = fs.readFileSync(file, 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const declared = new Set();
  // imports
  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') {
      for (const s of node.specifiers) declared.add(s.local.name);
    }
  }
  // local bindings (top-level + function-local + params + classes)
  walk.simple(ast, {
    VariableDeclaration(n) { for (const d of n.declarations) collectPatternIds(d.id, declared); },
    FunctionDeclaration(n) {
      if (n.id) declared.add(n.id.name);
      for (const p of n.params) collectPatternIds(p, declared);
    },
    FunctionExpression(n) {
      if (n.id) declared.add(n.id.name);
      for (const p of n.params) collectPatternIds(p, declared);
    },
    ArrowFunctionExpression(n) { for (const p of n.params) collectPatternIds(p, declared); },
    CatchClause(n) { if (n.param) collectPatternIds(n.param, declared); },
    ClassDeclaration(n) { if (n.id) declared.add(n.id.name); },
  });

  const unresolved = new Set();
  walk.ancestor(ast, {
    Identifier(node, ancestors) {
      const parent = ancestors[ancestors.length - 2];
      if (!parent) return;
      if (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) return;
      if (parent.type === 'Property' && parent.key === node && !parent.computed) return;
      if (parent.type === 'MethodDefinition' && parent.key === node && !parent.computed) return;
      if (parent.type === 'PropertyDefinition' && parent.key === node && !parent.computed) return;
      if (parent.type === 'LabeledStatement' && parent.label === node) return;
      if (parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') return;
      if (parent.type === 'VariableDeclarator' && parent.id === node) return;
      if (parent.type === 'FunctionDeclaration' && parent.id === node) return;
      if (parent.type === 'FunctionExpression' && parent.id === node) return;
      if (parent.type === 'ClassDeclaration' && parent.id === node) return;
      if (parent.type === 'ImportSpecifier' || parent.type === 'ImportDefaultSpecifier' || parent.type === 'ImportNamespaceSpecifier') return;
      if (parent.type === 'ExportSpecifier') return;
      // function params
      if ((parent.type === 'FunctionDeclaration' || parent.type === 'FunctionExpression' || parent.type === 'ArrowFunctionExpression') && parent.params.includes(node)) return;
      const name = node.name;
      if (BROWSER_GLOBALS.has(name)) return;
      if (declared.has(name)) return;
      unresolved.add(name);
    },
  });

  if (unresolved.size) {
    totalUnresolved += unresolved.size;
    console.log(`[${file}] UNRESOLVED: ${[...unresolved].sort().join(', ')}`);
  } else {
    console.log(`[${file}] ok`);
  }
}
process.exit(totalUnresolved ? 1 : 0);
