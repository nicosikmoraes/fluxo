<?php
// This fixture and assertion run only against the disposable database supplied by
// tests/roadmap-migration.cjs, never the application's database.
$db=new PDO('sqlite:'.getenv('DB_DATABASE'));
$db->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);
if(($argv[1]??'')==='seed') {
    $db->exec("INSERT INTO projects (id,title,cover) VALUES (1,'Projeto existente','desk')");
    $db->exec("INSERT INTO tasks (id,project_id,title,position) VALUES (1,1,'Task posterior',2),(2,1,'Task inicial',0),(3,NULL,'Sem projeto',0)");
    $db->exec("INSERT INTO activities (id,task_id,title,position,status,blocked) VALUES (1,1,'Último passo',0,'pending',0),(2,2,'Segundo passo',1,'doing',0),(3,2,'Primeiro passo',0,'done',0),(4,3,'Passo avulso',0,'pending',0)");
    $db->exec("INSERT INTO comments (activity_id,body) VALUES (1,'Comentário preservado')");
} else {
    $rows=$db->query('SELECT id,roadmap_position,position,status FROM activities WHERE task_id IN (1,2) ORDER BY roadmap_position')->fetchAll(PDO::FETCH_ASSOC);
    if(array_column($rows,'id')!==[3,2,1]||array_column($rows,'roadmap_position')!==[0,1,2])throw new RuntimeException('Ordem inicial do roadmap incorreta.');
    if($rows[1]['position']!==1||$rows[1]['status']!=='doing')throw new RuntimeException('Dados da atividade alterados.');
    if($db->query('SELECT body FROM comments')->fetchColumn()!=='Comentário preservado')throw new RuntimeException('Comentário alterado.');
    if($db->query('SELECT roadmap_position FROM activities WHERE id=4')->fetchColumn()!==null)throw new RuntimeException('Atividade sem projeto recebeu posição.');
    echo "PASSOU — migração inicializa o roadmap e preserva atividades, status e comentários existentes.\n";
}
