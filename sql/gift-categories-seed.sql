-- Ready-made category structure for the Gift shop.
-- Idempotent. Existing category names and ordering are never overwritten.
insert into public.gift_categories(name,slug,description,sort_order,is_active)
values
 ('Коледа','koleda','Подаръчни комплекти за Коледа.',10,true),
 ('Великден','velikden','Пролетни подаръци за Великден.',20,true),
 ('Свети Валентин','sveti-valentin','Подаръци за любимите хора.',30,true),
 ('8 март','osmi-mart','Подаръци за Международния ден на жената.',40,true),
 ('Баба Марта','baba-marta','Малки жестове за здраве и късмет.',50,true),
 ('За бебе','bebe','Нежни подаръци за най-малките.',60,true),
 ('За деца','deca','Комплекти за малките.',70,true),
 ('За поводи','povodi','Подаръци за всеки специален повод.',80,true)
on conflict (slug) do nothing;