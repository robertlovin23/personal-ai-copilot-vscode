import { Ollama } from "ollama";
import prettier from 'prettier';
import * as vscode from 'vscode';

async function refactorCode(editor: vscode.TextEditor, selectedModel: string, languageToTestFrameworkMap: { [key: string]: string}, ollama: Ollama, prettier: any, languageToParser: { [key: string]: prettier.BuiltInParserName }) {
    const userMessage = editor.document.getText(editor.selection);
    const inputs = `Refactor the following code to improve readability, performance, and maintainability. 
    Return only the refactored code itself in JavaScript format, with inline comments explaining each change. 
    No introductory phrases or non-commented text outside the code block:
    ${userMessage}`;
    
    
    const response = await ollama.generate({
      model: selectedModel,
      prompt: inputs,
      options: {
          temperature: 0.6,                 // Control response randomness
          top_p: 0.9,                       // Set to balance diversity and focus
      }
    })

    let data = response.response
    data = data.replace(/```[a-zA-Z]*|```/g, "");
    data = data.replace(/^(\d\.\s)/gm, '// $1');

    editor.edit(editBuilder => {
        vscode.window.showInformationMessage(`Respnse details: ${response.response}`);
        editBuilder.replace(editor.selection, data);
    });
}

export default refactorCode;