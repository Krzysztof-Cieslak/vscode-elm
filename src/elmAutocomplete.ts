import * as vscode from 'vscode';
import * as oracle from './elmOracle'

export class ElmCompletionProvider implements vscode.CompletionItemProvider {
  public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionItem[]> {
    let wordRange = document.getWordRangeAtPosition(position);
    let currentWord: string = document.getText(wordRange);

    return oracle.GetOracleResults(document, position)
      .then((result) => {
        var r = result.map((v, i, arr) => {
          var ci: vscode.CompletionItem = new vscode.CompletionItem(v.fullName);
          ci.kind = 0;
          ci.insertText = v.name.startsWith(currentWord) ? v.name : v.fullName;
          ci.detail = v.signature;
          ci.documentation = v.comment;
          return ci;
        });
        return r;
      });
  }
}
