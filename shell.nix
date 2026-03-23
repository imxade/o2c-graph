{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = [
    pkgs.nodejs_24
  ];

  shellHook = ''
    echo "Dodge Project shell initialized with Node.js 24"
    node -v
    npm -v
  '';
}
