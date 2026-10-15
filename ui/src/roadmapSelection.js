export function selectionBounds(start, end) {
 return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x-start.x), height: Math.abs(end.y-start.y) };
}

export function intersectingCards(nodes, bounds, width=272, height=184) {
 return nodes.filter(node=>node.x<bounds.x+bounds.width&&node.x+width>bounds.x&&node.y<bounds.y+bounds.height&&node.y+height>bounds.y).map(node=>node.id);
}

export function translateCards(nodes, deltaX, deltaY) {
 if(!nodes.length)return [];
 const dx=Math.max(-Math.min(...nodes.map(node=>node.x)),Math.min(1000000-Math.max(...nodes.map(node=>node.x)),Math.round(deltaX)));
 const dy=Math.max(-Math.min(...nodes.map(node=>node.y)),Math.min(1000000-Math.max(...nodes.map(node=>node.y)),Math.round(deltaY)));
 return nodes.map(({id,x,y})=>({id,x:x+dx,y:y+dy}));
}

export function layoutMovePayload(before, positions) {
 const changes=new Map(positions.map(node=>[node.id,node]));
 return { nodes: before.map(({id,x,y})=>({id,x:changes.get(id)?.x??x,y:changes.get(id)?.y??y,previous_x:x,previous_y:y})) };
}
