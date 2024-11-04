import { Ollama } from "ollama";
import prettier from 'prettier';
import * as vscode from 'vscode';

async function lintCode(editor: vscode.TextEditor, selectedModel: string, languageToTestFrameworkMap: { [key: string]: string}, ollama: Ollama, prettier: any, languageToParser: { [key: string]: prettier.BuiltInParserName }){
    const userMessage = editor.document.getText(editor.selection) || editor.document.getText();
    const inputs = `Review the following code for any common linting issues such as missing semicolons, unused variables, and minor syntax improvements. 
    Return only the corrected code without explanations or comments.
    Code:
    ${userMessage}`;
          
    const response = await ollama.generate({
        model: selectedModel,
        prompt: inputs,
        options: {
            temperature: 0.3,   // Lower temperature for more specific feedback
            top_p: 0.9,
        },
    });

    let correctedCode = response.response;
    correctedCode = correctedCode.replace(/```[a-zA-Z]*|```/g, "");

    editor.edit(editBuilder => {
        editBuilder.replace(editor.selection, correctedCode);
    });
    vscode.window.showInformationMessage('Linting completed and suggestions applied.');
}

export default lintCode;