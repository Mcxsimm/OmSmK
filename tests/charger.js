// Charge les scripts « classiques » du navigateur et expose leurs fonctions aux tests.
export function charger(fichiers, noms) {
  const src = fichiers.map(f => Deno.readTextFileSync(new URL('../' + f, import.meta.url))).join('\n;\n');
  return new Function(`${src}\nreturn { ${noms.join(', ')} };`)();
}
