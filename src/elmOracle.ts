import * as cp from 'child_process';
import * as path from 'path';
import {pluginPath, detectProjectRoot} from './elmUtils';
import * as vscode from 'vscode';
import * as userProject from './elmUserProject'

export interface IOracleResult {
  name: string;
  fullName: string;
  href: string;
  signature: string;
  comment: string;
  kind?: vscode.CompletionItemKind;
}

export enum OracleAction { IsHover, IsAutocomplete }

const config = vscode.workspace.getConfiguration('elm');

let oraclePath = pluginPath + path.sep + 'node_modules' + path.sep + 'elm-oracle' + path.sep + 'bin' + path.sep + 'elm-oracle';

export function GetOracleResults(document: vscode.TextDocument, position: vscode.Position, action: OracleAction): Thenable<IOracleResult[]> {
  return new Promise((resolve: Function, reject: Function) => {
      let p: cp.ChildProcess;
      let filename: string = document.fileName;
      let cwd = detectProjectRoot(document.fileName) || vscode.workspace.rootPath;
      let fn = path.relative(cwd, filename)
      let wordAtPosition = document.getWordRangeAtPosition(position);
      if (!wordAtPosition) {
        return resolve (null);
      }
      let currentWord: string = document.getText(wordAtPosition);
      let oracleCmd = oraclePath + ' "' + fn + '" ' + currentWord;
       
      p = cp.exec('node ' + oracleCmd, { cwd: cwd }, (err: Error, stdout: Buffer, stderr: Buffer) => {
        try {
          if (err) {
            return resolve(null);
          }
          
          const result: IOracleResult[] = [
            ...JSON.parse(stdout.toString()),
            ...(config['userProjectIntellisense'] ? userProject.userProject(document, position, currentWord, action) : [])
          ];
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
    });
}