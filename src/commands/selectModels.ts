import { Ollama } from "ollama";
import prettier from 'prettier';
import * as vscode from 'vscode';


async function selectModels(editor: vscode.TextEditor, selectedModel: string, languageToTestFrameworkMap: { [key: string]: string}, ollama: Ollama, prettier: any, languageToParser: { [key: string]: prettier.BuiltInParserName }) {

}

export default selectModels;