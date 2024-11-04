import { Ollama } from "ollama";
import prettier from 'prettier';
import * as vscode from 'vscode';

async function generateUnitTests(editor: vscode.TextEditor, selectedModel: string, languageToTestFrameworkMap: { [key: string]: string}, ollama: Ollama, prettier: any, languageToParser: { [key: string]: prettier.BuiltInParserName }) {
    let userMessage = editor.document.getText(editor.selection);
    const language = editor.document.languageId;

    const testFramework = languageToTestFrameworkMap[language];
    if (!testFramework) {
        vscode.window.showErrorMessage(`No test framework found for ${language}`);
        return;
    }
    const inputs = `Given the following code snippet, write unit tests using ${testFramework} to test the functionality of the code. 
    Return only the unit tests without any additional explanations or comments.
    ${userMessage}`;

    const response = await ollama.generate({
        model: selectedModel,
        prompt: inputs,
        options: {
            temperature: 0.5,  
            top_p: 0.9,
        },
    });
    let testCode = response.response.trim().replace(/```[a-zA-Z]*|```/g, "");

    const parser = languageToParser[language];
    if(parser){
        testCode = await prettier.format(testCode, { parser });
    } else {
        console.error("No parser found for language: ", language);
    }

    // Insert the generated unit test code into a new editor tab
    const testDocument = await vscode.workspace.openTextDocument({
        content: testCode,
        language: language,
    });
    await vscode.window.showTextDocument(testDocument);
}

export default generateUnitTests;