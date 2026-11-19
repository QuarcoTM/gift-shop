export function createStockPanel({state,esc,money,formInput,dialog,dialogActions,heading,rest}) {
  const recipe=p=>state.recipes.filter(line=>line.product_id===p.id);
  const part=id=>state.components.find(c=>c.id===id);
  function stock() {
    const components=state.components.map(c=>'<tr><td>'+esc(c.name)+'</td><td>'+c.units+'</td><td>'+esc(money(c.unit_cost))+'</td><td><button class="table-action" data-edit-part="'+esc(c.id)+'">Редактирай</button></td></tr>').join("");
    const sets=state.products.map(p=>{
      const lines=recipe(p);
      const capacity=lines.length?Math.min(...lines.map(r=>Math.floor(part(r.component_id).units/r.units))):null;
      const cost=lines.reduce((n,r)=>n+part(r.component_id).unit_cost*r.units,0);
      return '<tr><td>'+esc(p.name)+'</td><td>'+(lines.length?esc(money(cost)):'—')+'</td><td>'+(capacity??'—')+'</td><td>'+Math.min(capacity??Infinity,p.stock_quantity)+'</td><td><button class="table-action" data-recipe="'+esc(p.id)+'">Състав</button></td></tr>';
    }).join("");
    return heading("СКЛАД","Компоненти и комплекти","Включи в себестойността и опаковъчните материали.",'<button class="primary-button" data-action="new-part">Нов компонент</button>')+
      '<section class="panel"><h2>Компоненти</h2><div class="table-scroll"><table class="data-table"><thead><tr><th>Име</th><th>Бройки</th><th>Цена за брой</th><th></th></tr></thead><tbody>'+components+'</tbody></table></div></section>'+
      '<section class="panel"><h2>Комплекти</h2><div class="table-scroll"><table class="data-table"><thead><tr><th>Комплект</th><th>Себестойност</th><th>Могат да се сглобят</th><th>За продажба</th><th></th></tr></thead><tbody>'+sets+'</tbody></table></div></section>';
  }
  function editPart(id) {
    const c=part(id);
    dialog(c?"Редактирай компонент":"Нов компонент","СКЛАД",'<form data-kind="part" data-id="'+esc(id||"")+'" data-original="'+esc(c?.units??"")+'">'+formInput("Име","name",c?.name,"text",true)+formInput("Налични бройки","units",c?.units??0,"number",true)+formInput("Покупна цена за брой (€)","unit_cost",c?.unit_cost??0,"number",true)+dialogActions()+'</form>');
  }
  function editRecipe(id) {
    const p=state.products.find(p=>p.id===id);
    const fields=state.components.map(c=>formInput(c.name,"part_"+c.id,recipe(p).find(r=>r.component_id===c.id)?.units||0,"number")).join("");
    dialog(p.name,"СЪСТАВ",'<form data-kind="recipe" data-id="'+esc(id)+'"><p>Бройки за един комплект. Въведи 0 за неизползван компонент.</p>'+fields+dialogActions()+'</form>');
  }
  async function save(kind,form,f) {
    if(kind==="part"){
      const id=form.dataset.id;
      const values={name:f.get("name").trim(),units:Number(f.get("units")),unit_cost:Number(f.get("unit_cost"))};
      if(!Number.isSafeInteger(values.units)||values.units<0) throw Error("Въведи цяло число за наличността.");
      const result=await rest("gift_components"+(id?"?id=eq."+id+"&units=eq."+Number(form.dataset.original):""),id?"PATCH":"POST",values);
      if(!result?.length)throw Error("Наличността се промени. Обнови склада и въведи новото количество.");
    }else{
      const parts=state.components.map(c=>({component_id:c.id,units:Number(f.get("part_"+c.id))})).filter(r=>r.units!==0);
      if(parts.some(r=>!Number.isInteger(r.units)||r.units<1)) throw Error("Въведи цели бройки.");
      await rest("rpc/gift_set_recipe","POST",{p_product:form.dataset.id,p_parts:parts});
    }
  }
  function inquiries(){
    return heading("ПРОДАЖБИ","Запитвания за оферта","Количество, бюджет и срок за всяко събитие.")+
      (state.inquiries.length?state.inquiries.map(q=>'<article class="panel"><h2>'+q.quantity+' комплекта · '+esc(money(q.budget))+' за комплект</h2><p>За '+esc(q.needed_on)+' · '+esc(q.contact)+'</p><p>'+esc(q.occasion)+'</p><button type="button" class="secondary-button" data-handle-inquiry="'+esc(q.id)+'" '+(q.handled?'disabled':'')+'>'+(q.handled?'Обработено':'Отбележи като обработено')+'</button></article>').join(""):'<p>Все още няма запитвания.</p>');
  }
  return {stock,editPart,editRecipe,save,inquiries};
}
