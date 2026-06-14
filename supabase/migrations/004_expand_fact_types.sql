alter table public.facts
  drop constraint if exists facts_type_check;

alter table public.facts
  add constraint facts_type_check check (
    fact_type in (
      'weakness',
      'resistance',
      'nullifies',
      'drains',
      'repels',
      'location',
      'strategy',
      'recommended_party',
      'fusion_recipe',
      'arcana',
      'base_level',
      'unlock_condition',
      'deadline',
      'reward',
      'prerequisite',
      'floor_range',
      'tip',
      'schedule',
      'answer_choice',
      'item_effect'
    )
  );
