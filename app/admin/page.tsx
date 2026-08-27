'use client';

import { useState } from 'react';
import QRCode from 'qrcode';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function AdminPage() {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    region: '',
    altitude: '',
    process: '',
    variety: '',
    descriptors: '',
    q_score: ''
  });
  
  const [qrUrl, setQrUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMessage('');

    try {
      const descriptorsArray = formData.descriptors
        ? formData.descriptors.split(',').map(item => item.trim())
        : [];

      const cleanId = formData.id.toLowerCase().trim();

      // Сохраняем лот в Supabase
      const { error } = await supabase
        .from('coffee_lots')
        .insert([
          {
            id: cleanId,
            name: formData.name,
            region: formData.region,
            altitude: formData.altitude,
            process: formData.process,
            variety: formData.variety,
            descriptors: descriptorsArray,
            q_score: formData.q_score ? parseFloat(formData.q_score) : null,
          }
        ]);

      if (error) throw error;

      // Генерируем QR-код со ссылкой на страницу кофе
      const coffeeUrl = window.location.origin + '/coffee/' + cleanId;
      const url = await QRCode.toDataURL(coffeeUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: '#1a1a1a',
          light: '#faf8f5'
        }
      });

      setQrUrl(url);
      setStatusMessage('Успех! Лот сохранён в базу, QR-код сгенерирован.');
    } catch (err: any) {
      console.error(err);
      setStatusMessage('Ошибка при сохранении: ' + (err.message || 'Что-то пошло не так'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '40px auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <h2>Создание карточки кофе</h2>
      
      {statusMessage && (
        <div style={{ 
          padding: '10px', 
          marginBottom: '15px', 
          background: statusMessage.includes('Ошибка') ? '#ffe6e6' : '#e6ffe6',
          borderRadius: '4px' 
        }}>
          {statusMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>ID лота (латиницей, без пробелов):</label>
          <input 
            placeholder="ethiopia-aricha-01" 
            value={formData.id} 
            onChange={e => setFormData({...formData, id: e.target.value})}
            required
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>Название лота:</label>
          <input 
            placeholder="Эфиопия Иргачефф" 
            value={formData.name} 
            onChange={e => setFormData({...formData, name: e.target.value})}
            required
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>Регион / Ферма:</label>
          <input 
            placeholder="Иргачефф, зона Гедео" 
            value={formData.region} 
            onChange={e => setFormData({...formData, region: e.target.value})}
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>Высота:</label>
            <input 
              placeholder="1900–2100 м" 
              value={formData.altitude} 
              onChange={e => setFormData({...formData, altitude: e.target.value})}
              style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>Обработка:</label>
            <input 
              placeholder="Мытая" 
              value={formData.process} 
              onChange={e => setFormData({...formData, process: e.target.value})}
              style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>Дескрипторы (через запятую):</label>
          <input 
            placeholder="Жасмин, Бергамот, Персик" 
            value={formData.descriptors} 
            onChange={e => setFormData({...formData, descriptors: e.target.value})}
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>Q-Score:</label>
          <input 
            type="number"
            step="0.1"
            placeholder="87.5" 
            value={formData.q_score} 
            onChange={e => setFormData({...formData, q_score: e.target.value})}
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          />
        </div>

        <button 
          type="submit" 
          disabled={loading}
          style={{ 
            padding: '12px', 
            background: loading ? '#ccc' : '#aa840a', 
            color: '#fff', 
            border: 'none', 
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 'bold'
          }}
        >
          {loading ? 'Сохранение...' : 'Сохранить лот и создать QR-код'}
        </button>
      </form>

      {qrUrl && (
        <div style={{ marginTop: '30px', textAlign: 'center', padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
          <h3>Готовый QR-код:</h3>
          <img src={qrUrl} alt="QR Code" style={{ border: '1px solid #d4af37', padding: '10px', background: '#faf8f5' }} />
          <br />
          <a href={qrUrl} download={formData.id + '-qr.png'} style={{ display: 'inline-block', marginTop: '15px', color: '#aa840a', fontWeight: 'bold' }}>
            Скачать QR-код (PNG)
          </a>
        </div>
      )}
    </div>
  );
}