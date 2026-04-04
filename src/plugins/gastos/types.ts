export interface Servicio {
  id: string
  nombre: string
  emoji: string
  numeroCuenta?: string
  categoria: string
  activo: boolean
  orden: number
}

export interface PagoMensual {
  id: string
  servicioId: string
  mes: string       // "YYYY-MM"
  monto: number
  fecha?: string    // "DD/MM"
  metodoPago?: string
  pagado: boolean
  notas?: string
}

export interface QueryItem {
  id: string
  motor: string
  descripcion: string
  query: string
  tags?: string[]
  orden: number
}

export interface Credencial {
  id: string
  nombre: string
  usuario: string
  password: string
  url?: string
  notas?: string
  categoria?: string
  orden: number
}
