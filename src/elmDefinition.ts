import * as vscode from 'vscode';
import { ElmWorkspaceSymbolProvider } from './elmWorkspaceSymbols';
import { ModuleImport } from 'elm-module-parser';
import { getGlobalProjectManager } from './elmProjectManager';
import * as _ from 'lodash';

export class ElmDefinitionProvider implements vscode.DefinitionProvider {
  public constructor(
    private languagemode: vscode.DocumentFilter,
    private workspaceSymbolProvider: ElmWorkspaceSymbolProvider,
  ) { }

  public async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.Location> {
    const wordRange = document.getWordRangeAtPosition(position);

    if (_.isNil(wordRange)) {
      return null;
    }

    try {
      const parsedModule = await getGlobalProjectManager()
        .moduleFromPath(document.fileName);

      const word = document.getText(wordRange);
      const symbolName = word.substring(word.lastIndexOf('.') + 1);
      const moduleAlias = word.substring(0, word.lastIndexOf('.'));

      const matchingImports: ModuleImport[] = parsedModule.imports.filter(i => {
        if (moduleAlias === '') {
          const matchedExposing = i.exposing.find(e => {
            return e.name === symbolName;
          });

          return matchedExposing != null;
        } else {
          return i.alias === moduleAlias || i.module === moduleAlias;
        }
      });

      const modulesToSearch = _.isEmpty(matchingImports)
        ? [parsedModule.name]
        : matchingImports.map(x => x.module);

      const [firstStrongMatch] = _.flatten(await Promise.all(modulesToSearch.map(m => {
        return this.workspaceSymbolProvider.provideWorkspaceSymbols(`${m}:${symbolName}`, token);
      })));

      if (!_.isNil(firstStrongMatch)) {
        return firstStrongMatch.location;
      } else if (moduleAlias === '') {
        const allImported = parsedModule.imports.filter(i => {
          return (
            i.exposes_all || i.exposing.find(e => e.type === 'constructor')
          );
        });

        // This could find non-exposed symbols
        const fuzzyMatches = await Promise.all(
          allImported.map(i => {
            return this.workspaceSymbolProvider.provideWorkspaceSymbols(
              `${i.module}:${symbolName}`,
              token,
            );
          }),
        );

        const [firstFuzzy] = _.flatten(fuzzyMatches);

        return _.isNil(firstFuzzy) ? null : firstFuzzy.location;
      } else {
        return null;
      }
    } catch (error) {
      return null;
    }
  }
}
