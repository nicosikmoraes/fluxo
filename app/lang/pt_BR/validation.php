<?php
return [
 'required'=>'O campo :attribute é obrigatório.', 'string'=>'O campo :attribute deve ser um texto.', 'integer'=>'O campo :attribute deve ser um número inteiro.',
 'boolean'=>'O campo :attribute deve ser verdadeiro ou falso.', 'array'=>'O campo :attribute deve ser uma lista.', 'distinct'=>'O campo :attribute não pode conter itens repetidos.',
 'exists'=>'O item selecionado em :attribute não existe mais.', 'in'=>'O valor de :attribute não é válido.', 'regex'=>'O formato de :attribute não é válido.',
 'file'=>'Escolha um arquivo válido.', 'mimes'=>'A imagem deve ser JPG, PNG, WebP ou GIF.',
 'max'=>['string'=>'O campo :attribute aceita no máximo :max caracteres.','file'=>'A imagem pode ter no máximo 8 MB.','array'=>'A lista aceita no máximo :max itens.','numeric'=>'O campo :attribute não pode ser maior que :max.'],
 'min'=>['array'=>'A lista precisa de pelo menos :min item.','string'=>'O campo :attribute precisa de pelo menos :min caractere.'],
 'attributes'=>['title'=>'título','description'=>'descrição','project_id'=>'projeto','body'=>'comentário','blocking_person'=>'pessoa','blocking_reason'=>'motivo','cover'=>'capa','image'=>'imagem','status'=>'status','ids'=>'ordem'],
];
