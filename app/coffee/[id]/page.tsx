import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CoffeeCardPage({ params }: Props) {
  const { id } = await params;

  // Получаем данные о лоте из Supabase
  const { data: coffee, error } = await supabase
    .from('coffee_lots')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !coffee) {
    notFound();
  }

  return (
    <main style={{ 
      minHeight: '100vh', 
      backgroundColor: '#faf8f5', 
      color: '#1a1a1a', 
      padding: '24px 16px',
      fontFamily: 'sans-serif'
    }}>
      <div style={{
        maxWidth: '480px',
        margin: '0 auto',
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
        border: '1px solid #e5de1'
      }}>
        {/* Заголовок лота */}
        <span style={{ 
          fontSize: '12px', 
          fontWeight: 'bold', 
          letterSpacing: '1px', 
          color: '#aa840a', 
          textTransform: 'uppercase' 
        }}>
          Паспорт Кофе
        </span>
        <h1 style={{ fontSize: '28px', margin: '8px 0 16px', lineHeight: '1.2' }}>
          {coffee.name}
        </h1>

        {/* Оценка Q-Score */}
        {coffee.q_score && (
          <div style={{
            display: 'inline-block',
            backgroundColor: '#fef3c7',
            color: '#92400e',
            padding: '6px 12px',
            borderRadius: '20px',
            fontWeight: 'bold',
            fontSize: '14px',
            marginBottom: '20px'
          }}>
            Q-Score: {coffee.q_score}
          </div>
        )}

        {/* Основные характеристики */}
        <div style={{ display: 'grid', gap: '12px', fontSize: '15px', borderTop: '1px solid #f0f0f0', paddingTop: '16px' }}>
          {coffee.region && (
            <div>
              <strong style={{ color: '#666' }}>Регион / Ферма:</strong> {coffee.region}
            </div>
          )}
          {coffee.process && (
            <div>
              <strong style={{ color: '#666' }}>Обработка:</strong> {coffee.process}
            </div>
          )}
          {coffee.altitude && (
            <div>
              <strong style={{ color: '#666' }}>Высота:</strong> {coffee.altitude}
            </div>
          )}
          {coffee.variety && (
            <div>
              <strong style={{ color: '#666' }}>Разновидность:</strong> {coffee.variety}
            </div>
          )}
        </div>

        {/* Дескрипторы вкуса */}
        {coffee.descriptors && coffee.descriptors.length > 0 && (
          <div style={{ marginTop: '24px', borderTop: '1px solid #f0f0f0', paddingTop: '16px' }}>
            <h3 style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Вкусовой профиль:</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {coffee.descriptors.map((desc: string, index: number) => (
                <span key={index} style={{
                  backgroundColor: '#f3f4f6',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '13px'
                }}>
                  {desc}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}